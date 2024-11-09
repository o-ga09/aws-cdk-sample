#API用コンテナに含めるバイナリを作成するコンテナ
FROM golang:1.23-bullseye as deploy-builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN go build -trimpath -ldflags "-w -s" -o main ./cmd/main.go

#-----------------------------------------------
#API デプロイ用コンアテナ
FROM centos:centos7 as deploy-api

RUN sed -i 's|^mirrorlist=|#mirrorlist=|g' /etc/yum.repos.d/CentOS-Base.repo
RUN sed -i 's|^#baseurl=http://mirror.centos.org|baseurl=http://vault.centos.org|g' /etc/yum.repos.d/CentOS-Base.repo
RUN yum -y update

EXPOSE "8080"

COPY --from=deploy-builder /app/main .

CMD ["./main"]

#-----------------------------------------------
#ローカル開発環境で利用するホットリロード環境
FROM golang:1.23 as dev

WORKDIR /app

COPY go.mod go.sum ./

RUN go install github.com/air-verse/air@latest
CMD ["air"]