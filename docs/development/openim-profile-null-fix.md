# OpenIM profile callback compatibility repair

Fixed source: `openimsdk/open-im-server` commit `865bb89517b48493ef9b1b5d9fde87fe0cb05cc7` (`v3.8.3-patch.15`).

## Observed failure and repair

The fixed `pkg/callbackstruct/user.go` profile fields are optional pointers without `omitempty`. `internal/rpc/user/callback.go` supplies nickname/faceURL but originally omits Ex in both before callbacks, so the plain hook serializes `ex:null`. RAP rejected that legitimate no-change field, preventing the actual profile policy probe.

RAP now ignores only absent or raw null optional nickname/faceURL/ex fields. Supplied values still must match the current public display name or empty faceURL/ex. Nonempty extensions, unapproved avatars, wrong names, malformed null wrappers, invalid subjects and invalid trusted operators/platforms remain denied. No session, lease, callback key or operator checks are removed.

The source patch now forwards `Ex: &req.UserInfo.Ex` for the plain hook and `Ex: req.UserInfo.Ex` for the extended hook. This closes the upstream omission that otherwise conceals a caller's nonempty Ex from the before hook while the RPC subsequently updates it. The extended `protocol/wrapperspb.StringValue.MarshalJSON` emits a scalar string; a nil pointer emits null.

## Verification and deployment

- API focused OpenIM suite: 12 tests passed; API TypeScript build passed.
- Portable Go 1.22.12 with the existing offline module cache: actual RPC before-hook builders and HTTP serialization tested for plain/extended nonempty Ex denial, empty Ex allowance and extended nil fields. This is synthetic HTTP test data, not a live OpenIM acceptance claim.
- Apply `deploy/openim/server/rap-auth.patch` to the exact fixed source. Include `internal/rpc/user/callback.go` and `internal/rpc/user/rap_profile_callback_test.go` in gofmt and `./internal/rpc/user` in the derived-image Go test command. Rebuild all derived server binaries and the research API; an unchanged official image cannot claim this repair.

The cloud profile probe and real SDK acceptance remain the deployment operator's gates. This change has no contract version, migration or database data changes.
