.PHONY: test plugin-test service-test

test: plugin-test service-test

plugin-test:
	python3 scripts/test_plugin.py

service-test:
	npm ci --prefix services/eval-mcp
	npm test --prefix services/eval-mcp
