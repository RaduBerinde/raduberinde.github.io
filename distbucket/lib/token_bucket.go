package lib

func TokenBucket(cfg *Config, requested PerNodeData) (granted PerNodeData, tokens Data) {
	tokens = ZeroData(cfg)
	granted = MakePerNodeData(cfg, len(requested))
	if len(requested) == 0 {
		return granted, tokens
	}

	// Make copies of requested, since we are going to modify the data.
	requested = requested.Copy(cfg)

	currTokens := cfg.InitialBurst

	// Maintain the current tick per node that needs tokens; requested is 0 up to
	// that tick.
	ticks := make([]int, len(requested))
	headOfQueue := func() int {
		m := 0
		for i := range ticks {
			// Skip over empty areas.
			for ticks[i] < len(requested[i]) && requested[i][ticks[i]] == 0 {
				ticks[i]++
			}
			if ticks[i] < ticks[m] {
				m = i
			}
		}
		return ticks[m]
	}

	tickDuration := cfg.Tick.Seconds()
	for now := range tokens {
		// If we have more than MaxBurst, then the initial burst was larger and we
		// are still using it.
		if currTokens < cfg.MaxBurst {
			currTokens += cfg.RatePerSec * tickDuration
			if currTokens > cfg.MaxBurst {
				currTokens = cfg.MaxBurst
			}
		}
		tokens[now] = currTokens
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
					reqRate += requested[i][t]
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
			// Give out to each node, proportionally to the ask.
			for i := range ticks {
				amount := requested[i][t] * fraction
				requested[i][t] -= amount
				granted[i][now] += amount
			}
		}
	}

	return granted, tokens
}
