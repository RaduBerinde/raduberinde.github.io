package lib

type globalBucket struct {
	currTokens   float64
	lastDeadline int
}

func (gb *globalBucket) tick(cfg Config, now int) {
	if gb.lastDeadline >= now {
		// We have already pre-distributed the tokens for this tick.
		return
	}
	// If we have more than MaxBurst, then the initial burst was larger and we
	// are still using it.
	if gb.currTokens < cfg.MaxBurst {
		gb.currTokens += cfg.RatePerSec * cfg.Tick.Seconds()
		if gb.currTokens > cfg.MaxBurst {
			gb.currTokens = cfg.MaxBurst
		}
	}
}

func (gb *globalBucket) request(cfg Config, now int, amount float64) (deadlineTick int) {
	if gb.currTokens >= amount {
		gb.currTokens -= amount
		return now
	}
	amount -= gb.currTokens
	gb.currTokens = 0
	// Calculate how many ticks we need to accumulate the necessary amount.
	n := int(amount/(cfg.RatePerSec*cfg.Tick.Seconds()) + 0.5)
	if n < 0 {
		n = 1
	}
	gb.lastDeadline = now + n
	return gb.lastDeadline
}

type localBucket struct {
	requested       Workload
	requestedTick   int
	granted         Workload
	currTokens      float64
	currRatePerTick float64
	deadlineTick    int
}

func (l *localBucket) distribute(now int, amount float64, deadlineTick int) {
	// Add up the tokens that were already pre-distributed.
	if l.deadlineTick > now {
		amount += float64(l.deadlineTick-now) * l.currRatePerTick
	}
	if deadlineTick <= now {
		l.deadlineTick = now
		l.currTokens += amount
		l.currRatePerTick = 0
		return
	}
	l.deadlineTick = deadlineTick
	l.currRatePerTick = amount / float64(deadlineTick-now)
}

func (l *localBucket) maintain(cfg Config, gb *globalBucket, now int) {
	if l.currTokens > cfg.LowWatermark {
		return
	}
	if float64(l.deadlineTick-now)*cfg.Tick.Seconds() < cfg.PreRequestTime.Seconds() {
		deadlineTick := gb.request(cfg, now, cfg.ReqAmount)
		// TODO(radu): simulate a delay.
		l.distribute(now, cfg.ReqAmount, deadlineTick)
	}
}

func (l *localBucket) request(cfg Config, now int, amount float64) float64 {
	l.currTokens += l.currRatePerTick
	if l.currTokens >= amount {
		l.currTokens = 0
		return amount
	}
	available := l.currTokens
	l.currTokens = 0
	return available
}

func (l *localBucket) tick(cfg Config, gb *globalBucket, now int) {
	tickDuration := cfg.Tick.Seconds()
	l.maintain(cfg, gb, now)
	for l.requestedTick <= now {
		amount := l.requested.Data[l.requestedTick]
		if amount == 0 {
			l.requestedTick++
			continue
		}
		granted := l.request(cfg, now, amount)
		l.granted.Data[now] += granted
		l.requested.Data[l.requestedTick] -= granted
		if granted < amount {
			return
		}
	}
}

func DistTokenBucket(
	cfg Config, nodes []Workload,
) (perNode []Workload, aggregate Workload, tokens Workload) {
	aggregate = ZeroWorkload(cfg)
	tokens = ZeroWorkload(cfg)
	if len(nodes) == 0 {
		return nil, aggregate, tokens
	}

	var global globalBucket
	local := make([]localBucket, len(nodes))
	for i := range local {
		local[i].requested = nodes[i].Copy()
		local[i].granted = ZeroWorkload(cfg)
	}

	global.currTokens = cfg.InitialBurst

	for now := range aggregate.Data {
		global.tick(cfg, now)
		tokens.Data[now] = global.currTokens

		for n := range nodes {
			local[n].tick(cfg, &global, now)
			aggregate.Data[now] += local[n].granted.Data[now]
		}
	}
	perNode = make([]Workload, len(local))
	for i := range perNode {
		perNode[i] = local[i].granted
	}
	return perNode, aggregate, tokens
}
