import { ExecutionContext, createParamDecorator } from "@nestjs/common"
import { $Enums } from "@prisma/client"

export interface RequestUser {
	userID: string
	email: string
}

export const User = createParamDecorator(
	(data: string, ctx: ExecutionContext): RequestUser => {
		const user = ctx.switchToHttp().getRequest().user

		return data ? user[data] : user
	},
)

export type UsersType = string | undefined

// export enum UsersAccessType {
// 	UserIdOrAdminAccess,
// 	UserIdOrUserFromQuery,
// }

// TODO: @cc rework, still needed at all?
export const UserId = createParamDecorator(
	(_, ctx: ExecutionContext): UsersType => {
		const user = ctx.switchToHttp().getRequest().user
		const query = ctx.switchToHttp().getRequest().query

		if (user.role !== $Enums.UserRole.User) {
			if (query?.user && query.user.length > 0) {
				return query.user
			}
			return undefined
		}
		return user.id
	},
)
