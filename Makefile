all: lint test

# Run ESLint against repository
lint:; npx jg lint

# Wipe any lingering fixtures and run unit-tests
TMP = test/fixtures/tmp
test:
	rm -rf $(TMP)
	mkdir $(TMP)
	npx mocha
	@rm -rf $(TMP)

.PHONY: lint test
