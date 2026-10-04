# Fixed OpenIM source; Apache-2.0. Apply the RAP identity patch before compiling.
FROM golang:1.22.12-alpine AS policy-build
RUN apk add --no-cache bash git
WORKDIR /openim-server
RUN git init \
    && git remote add origin https://github.com/openimsdk/open-im-server.git \
    && git fetch --depth 1 origin 865bb89517b48493ef9b1b5d9fde87fe0cb05cc7 \
    && git checkout --detach FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "865bb89517b48493ef9b1b5d9fde87fe0cb05cc7"
ENV GOMAXPROCS=2 GOFLAGS=-p=2 GOTOOLCHAIN=local
RUN go mod download
COPY rap-auth.patch /tmp/rap-auth.patch
RUN git apply --check /tmp/rap-auth.patch \
    && git apply /tmp/rap-auth.patch \
    && gofmt -w internal/msggateway/message_handler.go internal/msggateway/rap_auth_test.go pkg/common/webhook/http_client.go pkg/common/webhook/rap_auth_test.go \
    && go test ./internal/msggateway ./pkg/common/webhook \
    && go install github.com/magefile/mage@v1.15.0 \
    && mage build
# Keep the fixed upstream runtime/configuration layout, replace every compiled
# service so both synchronous and asynchronous callbacks use the trusted context.
FROM openim/openim-server:v3.8.3-patch.15
LABEL org.opencontainers.image.source="https://github.com/openimsdk/open-im-server" \
      org.opencontainers.image.revision="865bb89517b48493ef9b1b5d9fde87fe0cb05cc7" \
      com.acceptcat.research.openim-policy="rap1"
COPY --from=policy-build /openim-server/_output /openim-server/_output
