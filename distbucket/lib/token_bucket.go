package lib

func TokenBucket(cfg Config, nodes []Workload) (perNode []Workload, aggregate Workload, tokens Workload) {
	aggregate = ZeroWorkload(cfg)
	tokens = ZeroWorkload(cfg)
	perNode = make([]Workload, len(nodes))
	for i := range perNode {
		perNode[i] = ZeroWorkload(cfg)
	}
	if len(nodes) == 0 {
		return perNode, aggregate, tokens
	}

	currTokens := cfg.InitialBurst
	// Make copies of the workloads, since we are going to modify them.
	oldNodes := nodes
	nodes = make([]Workload, len(oldNodes))
	for i := range oldNodes {
		nodes[i] = oldNodes[i].Copy()
	}

	// Keep the current tick per node that needs tokens.

	ticks := make([]int, len(nodes))
	headOfQueue := func() int {
		m := 0
		for i := range ticks {
			// Skip over empty areas.
			for ticks[i] < len(nodes[i].Data) && nodes[i].Data[ticks[i]] == 0 {
				ticks[i]++
			}
			if ticks[i] < ticks[m] {
				m = i
			}
		}
		return ticks[m]
	}
	_ = headOfQueue

	tickDuration := cfg.Tick.Seconds()
	for now := range aggregate.Data {
		// If we have more than MaxBurst, then the initial burst was larger and we
		// are still using it.
		if currTokens < cfg.MaxBurst {
			currTokens += cfg.RatePerSec * tickDuration
			if currTokens > cfg.MaxBurst {
				currTokens = cfg.MaxBurst
			}
		}
		tokens.Data[now] = currTokens
		for currTokens > 0 {
			t := headOfQueue()
			if t > now {
				// All requests up to the current time have already been satisfied.
				break
			}

			// Now find all nodes that are at this tick and sum up how much they are
			// asking.
			var reqRate float64
			var n int
			for i := range ticks {
				if ticks[i] == t {
					reqRate += nodes[i].Data[t]
					n++
				}
			}
			reqUnits := reqRate * tickDuration
			fraction := 1.0
			if reqUnits > currTokens {
				// We can only satisfy this fraction of the requested.
				fraction = currTokens / reqUnits
				currTokens = 0
			} else {
				currTokens -= reqUnits
			}
			aggregate.Data[now] += reqRate * fraction
			// Give out to each node, proportionally to the ask.
			for i := range ticks {
				amount := nodes[i].Data[t] * fraction
				nodes[i].Data[t] -= amount
				perNode[i].Data[now] += amount
			}
		}
	}

	return perNode, aggregate, tokens
}
