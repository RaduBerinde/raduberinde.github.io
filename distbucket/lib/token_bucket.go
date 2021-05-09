package lib

func TokenBucket(nodes []Workload) (output Workload, tokens Workload) {
	cfg := nodes[0].Config
	output = ZeroWorkload(cfg)
	tokens = ZeroWorkload(cfg)

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
		for idx := range ticks {
			if ticks[m] > ticks[idx] {
				m = idx
			}
		}
		return m
	}
	_ = headOfQueue

	tickDuration := cfg.Tick.Seconds()
	for i := range output.Data {
		currTokens += cfg.RatePerSec * tickDuration
		if currTokens > cfg.MaxBurst {
			currTokens = cfg.MaxBurst
		}
		tokens.Data[i] = currTokens
		for {
			h := headOfQueue()
			if ticks[h] > i {
				// All nodes have already been satisfied.
				break
			}
			t := ticks[h]
			reqRate := nodes[h].Data[t]
			if reqRate == 0 {
				ticks[h]++
				continue
			}
			reqAbs := reqRate * tickDuration
			if reqAbs > currTokens {
				output.Data[i] += currTokens / tickDuration
				nodes[h].Data[t] -= currTokens / tickDuration
				currTokens = 0
				break
			}
			output.Data[i] += reqRate
			nodes[h].Data[t] = 0
			ticks[h]++
			currTokens -= reqAbs
		}
	}

	return output, tokens
}
