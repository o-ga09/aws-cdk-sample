package main

import (
	"clean-serverless-book-sample/adapter/presenter"
	"context"
	"log"
)

func main() {
	ctx := context.Background()
	if err := presenter.Run(ctx); err != nil {
		log.Fatal(err)
	}
}
