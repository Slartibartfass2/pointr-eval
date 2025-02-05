person <- list(firstName = "John", lastName = "Doe", age = 32, zipCode = 12345, city = "example")

person$firstName <- "Jane"
person$lastName <- "eoD"
person$age <- 34
person$zipCode <- 67890
person$city <- "other example"

print(person$age)
