// Copyright 2021 The Cockroach Authors.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.txt.
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0, included in the file
// licenses/APL.txt.

package main

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"sort"
	"unsafe"

	"github.com/cockroachdb/pebble/objstorage/objstorageprovider/objiotracing"
)

type Event = objiotracing.Event

const eventSize = int(unsafe.Sizeof(Event{}))

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "usage: process <trace-name> <trace-files>...\n")
		os.Exit(1)
	}
	traceName := os.Args[1]
	filenames := os.Args[2:]
	fmt.Printf("Creating trace %q\n", traceName)
	var size int64
	for _, name := range filenames {
		info, err := os.Stat(name)
		checkErr(err)
		size += info.Size()
	}

	buf := bytes.NewBuffer(make([]byte, 0, int(size)))
	for _, name := range filenames {
		fmt.Printf("Reading %s..\n", name)
		f, err := os.Open(name)
		checkErr(err)
		_, err = io.Copy(buf, f)
		checkErr(err)
		checkErr(f.Close())
	}

	asBytes := buf.Bytes()
	if len(asBytes)%eventSize != 0 {
	}
	p := unsafe.Pointer(&asBytes[0])
	events := unsafe.Slice((*Event)(p), len(asBytes)/eventSize)

	fmt.Printf("Sorting %d events..\n", len(events))
	sort.Slice(events, func(i, j int) bool {
		return events[i].StartUnixNano < events[j].StartUnixNano
	})

	outFilename := fmt.Sprintf("traces/%s.gz", traceName)
	fmt.Printf("Writing %s..\n", outFilename)
	out, err := os.Create(outFilename)
	checkErr(err)
	w := gzip.NewWriter(out)
	_, err = w.Write(asBytes)
	checkErr(err)
	checkErr(w.Close())
	checkErr(out.Close())
}

func checkErr(err error) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
}
