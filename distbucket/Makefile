all: distbucketjs workloads

distbucketjs: $(wildcard lib/*)
	gopherjs build

workloads: $(wildcard workloads/*)
	workloads/gen.sh
