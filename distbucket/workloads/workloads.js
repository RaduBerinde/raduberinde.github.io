var workloads = {
  constant: `nodes:
  - terms:
    - type: constant
      value: 100

  - terms:
    - type: constant
      value: 200

  - terms:
    - type: constant
      value: 400
`,
  noisy: `nodes:
  - terms:
    - type: constant
      value: 200
    
    - type: noise
      amplitude: 100
      smoothness: 20

  - terms:
    - type: constant
      value: 80

    - type: noise
      amplitude: 40
      smoothness: 5

  - terms:
    - type: sine
      amplitude: 120
      period: 100

    - type: noise
      amplitude: 40
      smoothness: 10
`,
  ramps: `nodes:
  - terms:
    - type: ramp
      duration: 10
      delta: 100

    - type: ramp
      start: 300
      duration: 10
      delta: -100

  - terms:
    - type: ramp
      duration: 20
      delta: 200

    - type: ramp
      start: 400
      duration: 20
      delta: -200

  - terms:
    - type: ramp
      duration: 30
      delta: 400

    - type: ramp
      start: 500
      duration: 30
      delta: -400
`,
  steps: `nodes:
  - terms:
    - type: constant
      value: 200
    
    - type: noise
      amplitude: 100
      smoothness: 100

    - type: constant
      value: -500
      start: 300

  - terms:
    - type: constant
      value: 80

    - type: noise
      amplitude: 40
      smoothness: 10

  - terms:
    - type: constant
      value: 400
      start: 50

    - type: constant
      value: -400
      start: 600

    - type: noise
      amplitude: 20
      smoothness: 10
      start: 50
      duration: 550
`,
  various: `nodes:
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
