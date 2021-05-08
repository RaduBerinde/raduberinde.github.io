package main

func TokenBucket(nodes []Workload) (output Workload, tokens Workload) {
	cfg := nodes[0].Config
	output = ZeroWorkload(cfg)
	tokens = ZeroWorkload(cfg)

	currTokens := cfg.InitialBurst

	// Keep the current tick per node that needs tokens.

	ticks := make([]int, len(nodes))
	headOfQueue := func() int {
		m := 0
		for idx := range ticks[1:] {
			if ticks[m] > ticks[idx] {
				m = idx
			}
		}
		return m
	}
	_ = headOfQueue

	for i := range output.Data {
		tokens.Data[i] = currTokens
		currTokens += cfg.RatePerSec * cfg.Tick.Seconds()
		if currTokens > cfg.MaxBurst {
			currTokens = cfg.MaxBurst
		}
		for currTokens > 0 {
			h := headOfQueue()
			if ticks[h] > i {
				// All nodes have already been satisfied.
				break
			}
			t := ticks[h]
			req := nodes[h].Data[t]
			if req > currTokens {
				output.Data[i] += currTokens
				nodes[h].Data[t] -= currTokens
				currTokens = 0
			} else {
				output.Data[i] += req
				currTokens -= req
				nodes[h].Data[t] = 0
				ticks[h]++
			}
		}
	}

	return output, tokens
}
