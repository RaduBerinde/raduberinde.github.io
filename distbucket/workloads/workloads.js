var workloads = {
  test: `nodes:
  - terms:
    - type: constant
      value: 100

    - type: ramp
      start: 5
      duration: 10
      delta: 50

    - type: ramp
      start: 25
      duration: 2
      delta: -50

  - terms:
    - type: constant
      value: 50

    - type: ramp
      start: 10
      duration: 10
      delta: 100

    - type: ramp
      start: 20
      duration: 5
      delta: -60

    - type: ramp
      start: 27
      duration: 1
      delta: -40

  - terms:
    - type: sine
      period: 15
      amplitude: 100

  - terms:
    - type: gaussian
      start: 20
      duration: 15
      amplitude: 200
`,
};
