var workloads = {
  noisy: `nodes:
  - terms:
    - type: constant
      value: 100
    
    - type: noise
      amplitude: 10
      smoothness: 50

  - terms:
    - type: constant
      value: 30

    - type: noise
      amplitude: 40
      smoothness: 10

  - terms:
    - type: sine
      amplitude: 40
      period: 100

    - type: noise
      amplitude: 20
      smoothness: 30
`,
  test: `nodes:
  - terms:
    - type: constant
      value: 100

    - type: ramp
      start: 25
      duration: 50
      delta: 50

    - type: ramp
      start: 125
      duration: 2
      delta: -50

  - terms:
    - type: constant
      value: 50

    - type: ramp
      start: 50
      duration: 50
      delta: 100

    - type: ramp
      start: 100
      duration: 25
      delta: -60

    - type: ramp
      start: 27
      duration: 5
      delta: -40

  - terms:
    - type: sine
      period: 75
      amplitude: 100

  - terms:
    - type: gaussian
      start: 100
      duration: 75
      amplitude: 200
`,
};
