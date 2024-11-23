import {
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	Logger,
	MethodNotAllowedException,
	NotFoundException,
	Param,
	Patch,
	Post,
	Query,
} from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { $Enums, User as UserModel } from "@prisma/client"
import parsePhoneNumberFromString from "libphonenumber-js"
import {
	ContactBulkDto,
	UpsertContactDto,
} from "src/contacts/dto/keaz-create-contact.dto"
import { Contact } from "src/contacts/entities/contact.entity"
import {
	ContactKpis,
	ContactWithTags,
	ContactWithTagsAndGroups,
	ContactsSortings,
} from "src/contacts/entities/keaz-contact.entity"
import { ApiOkResponsePaginated } from "src/decorators/paginate.decorator"
import { TagsService } from "src/tags/tags.service"
import { formatFon } from "src/utils/formatPhonenumber"
import { GetPaginateQuery, Paginate } from "src/utils/pagination"
import { User } from "../decorators/user.decorator"
import { ContactsService } from "./contacts.service"
import { CreateContactDto } from "./dto/create-contact.dto"
import { UpdateContactDto } from "./dto/update-contact.dto"

@ApiBearerAuth()
@ApiTags("contacts")
@Controller("contacts")
export class ContactsController {
	constructor(
		private readonly contactsService: ContactsService,
		private readonly tagsService: TagsService,
	) {}

	private readonly logger = new Logger(ContactsController.name)

	@Post()
	async createContact(
		@Body() createContactDto: CreateContactDto,
		@User("id") userID: string,
	): Promise<Contact> {
		const { fon } = createContactDto

		const parsed = parsePhoneNumberFromString(
			fon.includes("+") ? fon : `+${fon}`,
		)
		const internationalFormat = formatFon(fon)
		if (!internationalFormat || !parsed) {
			throw new ForbiddenException("Invalid phone number")
		}

		const existingContact = await this.contactsService.findOneByFonAndUser(
			createContactDto.fon,
			userID,
		)
		if (existingContact !== null) {
			throw new ForbiddenException("Contact already exists")
		}

		return this.contactsService.create(createContactDto, userID, {
			groups: true,
			tags: true,
			whatsAppConversation: {
				include: {
					contact: { select: { firstName: true, lastName: true, id: true } },
				},
			},
		})
	}

	@Get()
	@ApiOkResponsePaginated(ContactWithTagsAndGroups, ContactsSortings)
	async findAllContacts(
		@Query()
		query: GetPaginateQuery<ContactsSortings>,
		@User() user: UserModel,
	): Promise<Paginate<ContactWithTagsAndGroups>> {
		const contacts = await this.contactsService.findAll({
			userID: user.id,
			...query,
		})

		if (!contacts) {
			throw new NotFoundException("Contacts not found")
		}

		return {
			data: contacts,
			cursorID:
				contacts.length === (query.limit ?? 25)
					? contacts[contacts.length - 1].id
					: null,
		}
	}

	@Get("groups/:groupID")
	@ApiOkResponsePaginated(ContactWithTagsAndGroups, ContactsSortings)
	async findAllContactsForGroup(
		@Query()
		query: GetPaginateQuery<ContactsSortings>,
		@User("id") userID: string,
		@Param("groupID") groupID: string,
	): Promise<Paginate<ContactWithTagsAndGroups>> {
		const contacts = await this.contactsService.findAll({
			groupID,
			userID,
			...query,
		})

		if (!contacts) {
			throw new NotFoundException("Contacts not found")
		}

		return Paginate.create(contacts, query.limit)
	}

	@Get("/count")
	async getCount(@User("id") userID: string): Promise<number> {
		return await this.contactsService.getCount(userID)
	}
	@Get("/kpi")
	async getKpis(@User("id") userID: string): Promise<ContactKpis> {
		return await this.contactsService.getKpis(userID)
	}

	@Get(":id")
	async findOneContact(
		@Param("id") id: string,
		@User() user: UserModel,
	): Promise<ContactWithTags> {
		const contact = await this.contactsService.findOne(id)

		if (!contact) {
			throw new NotFoundException("Contact not found")
		}

		if (user.role === $Enums.UserRole.User && contact.byUserID !== user.id) {
			throw new MethodNotAllowedException(
				"Not allowed to access this broadcast",
			)
		}

		return contact
	}

	@SkipThrottle()
	@Post("upsert")
	async createOrUpdateContact(
		@Body() upsertContactDto: UpsertContactDto,
		@User("id") userID: string,
	): Promise<Contact> {
		const tags = await this.tagsService.upsertMany(
			upsertContactDto.tags.map((title) => ({ title })),
			userID,
		)

		return await this.contactsService.upsert(upsertContactDto, tags, userID)
	}

	@Patch(":id")
	async updateContact(
		@Param("id") id: string,
		@Body() updateContactDto: UpdateContactDto,
		@User() user: UserModel,
	): Promise<ContactWithTags> {
		const contact = await this.findOneContact(id, user)

		return this.contactsService.update(contact.id, updateContactDto)
	}

	@Patch("tag/:tagID")
	async addTagToContacts(
		@Body() dto: ContactBulkDto,
		@Param("tagID") tagID: string,
	) {
		return this.contactsService.addTagToContacts(tagID, dto.contactIDs, 0)
	}

	@Patch(":id/tag/:tagID")
	async addTagToContact(
		@Param("id") id: string,
		@Param("tagID") tagID: string,
		@User() user: UserModel,
	) {
		const contact = await this.findOneContact(id, user)
		if (!contact) {
			throw new NotFoundException("Contact not found")
		}

		return this.contactsService.addTagToContact(tagID, contact.id)
	}

	@Delete(":id/tag/:tagID")
	async removeTagFromContact(
		@Param("id") id: string,
		@Param("tagID") tagID: string,
		@User() user: UserModel,
	) {
		const contact = await this.findOneContact(id, user)
		if (!contact) {
			throw new NotFoundException("Contact not found")
		}

		return this.contactsService.removeTagFromContact(tagID, contact)
	}

	@Delete("many")
	async removeManyContacts(@Body() dto: ContactBulkDto): Promise<void> {
		await this.contactsService.removeMany(dto.contactIDs)
	}

	@Delete(":id")
	async removeContact(
		@Param("id") id: string,
		@User() user: UserModel,
	): Promise<void> {
		const contact = await this.findOneContact(id, user)

		await this.contactsService.remove(contact.id)
	}
}
