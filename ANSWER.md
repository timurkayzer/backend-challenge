# What to refactor/fix
### HIGH
- move validation to DTO - use class-validator, for example phone validation
- use logger, because it allows to investigate incidents easier (now logger is only in DB service)
- existing tests for `contacts.service` are broken
- no auth is used - only roles decorator
- tags and groups modules is not functional - return empty values

### MEDIUM
- use interceptor to format phone correctly, because this check is used in many places (for example `createContact` in controller and `create` in service), or add validation on phone format
- some code parts are unused - for easier refactoring would be better to remove (`ContactDto`, `ConnectContactDto`)

### LOW
- remove usage of `!property: type;`, because it makes TS ignore the possibility of empty values
- fix misspelling (like 'fon' instead of 'phone', but that's minor)
- use ConfigModule for environment variables, but this may be redundant for the case

# Testing strategy
1. Add tests for contacts module, because it's implemented - add unit-tests for contacts.service and contacts.controller
2. Add tests for utils, because many places are dependent on them
3. Add e2e tests for contacts module
4. Implement and repeat the same for groups and tags