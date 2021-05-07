package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v2"
)

// These struct are for the input yaml.
type Input struct {
	Config Config
	Nodes  []WorkloadDesc
}

// These structs are for the output json.
type Series struct {
	Name string
	Data []float64
}

type Chart struct {
	Title  string
	Series []Series
}

type Data struct {
	TimeAxis []float64

	Charts []Chart
}

const inputDirPath = "input"
const outputDirPath = "output"

func main() {
	finfo, err := os.Stat(inputDirPath)
	if err != nil {
		panic(err)
	}
	if !finfo.IsDir() {
		panic("not a directory")
	}
	files, err := ioutil.ReadDir(inputDirPath)
	if err != nil {
		panic(err)
	}
	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".yaml") {
			continue
		}
		inputFile := filepath.Join(inputDirPath, file.Name())
		outputFile := filepath.Join(outputDirPath, strings.TrimSuffix(file.Name(), ".yaml")+".json")
		fmt.Printf("%s -> %s\n", inputFile, outputFile)

		data, err := ioutil.ReadFile(inputFile)
		if err != nil {
			panic(err)
		}
		input := Input{
			Config: DefaultConfig,
		}

		if err := yaml.UnmarshalStrict([]byte(data), &input); err != nil {
			panic(err)
		}

		nodes := make([]Workload, len(input.Nodes))
		for i := range nodes {
			nodes[i] = MakeWorkload(input.Config, input.Nodes[i])
		}

		sum := nodes[0]
		for _, w := range nodes[1:] {
			sum = sum.Sum(w)
		}

		var d Data
		d.TimeAxis = input.Config.TimeAxis()
		nodeSeries := make([]Series, len(nodes))
		for i := range nodes {
			nodeSeries[i].Name = fmt.Sprintf("node %d", i+1)
			nodeSeries[i].Data = nodes[i].Data
		}
		d.Charts = []Chart{
			{
				Title:  "Requested per node",
				Series: nodeSeries,
			},
			{
				Title: "Requested aggregate",
				Series: []Series{{
					Name: "aggregate",
					Data: sum.Data,
				}},
			},
		}
		asJson, err := json.MarshalIndent(&d, "", "  ")
		if err != nil {
			panic(err)
		}
		if err := ioutil.WriteFile(outputFile, []byte(asJson), 0644); err != nil {
			panic(err)
		}
	}
	fmt.Printf("Done.\n")
}

/*
	cfg := DefaultConfig
	nodes := []Workload{
		MakeWorkload(cfg, WorkloadDesc{
			Type:          "linear",
			Baseline:      100,
			RampPerSecond: 1,
		}),
		MakeWorkload(cfg, WorkloadDesc{
			Type:          "linear",
			Baseline:      50,
			RampPerSecond: 4,
		}),
	}

	sum := nodes[0]
	for _, w := range nodes[1:] {
		sum = sum.Sum(w)
	}

	var d Data
	d.TimeAxis = cfg.TimeAxis()
	d.Charts = []Chart{
		{
			Title: "Requested per node",
			Series: []Series{
				{
					Name: "node 1",
					Data: nodes[0].Data,
				},
				{
					Name: "node 2",
					Data: nodes[1].Data,
				},
			},
		},
		{
			Title: "Requested aggregate",
			Series: []Series{{
				Name: "aggregate",
				Data: sum.Data,
			}},
		},
	}
	asJson, err := json.MarshalIndent(&d, "", "  ")
	if err != nil {
		panic(err)
	}

	fmt.Println(string(asJson))
}
*/
