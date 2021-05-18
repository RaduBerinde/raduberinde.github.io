all: workloads/workloads.js distbucketjs

distbucketjs: $(wildcard lib/*)
	gopherjs build

workloads/workloads.js: $(wildcard workloads/*.yaml)
	workloads/gen.sh
