.PHONY: test plugin-test workspace-deps eval-recorder-test judge-test service-test

test: plugin-test eval-recorder-test judge-test service-test

plugin-test:
	python3 scripts/test_plugin.py

workspace-deps:
	npm ci

eval-recorder-test: workspace-deps
	npm run eval:record:test

judge-test: workspace-deps
	npm run judge:test

service-test:
	npm ci --prefix services/eval-mcp
	npm test --prefix services/eval-mcp
