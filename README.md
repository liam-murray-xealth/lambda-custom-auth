# Custom authorizor

Example custom authorizers for API GW.

See [good overview](https://www.alexdebrie.com/posts/lambda-custom-authorizers/)

## Quickstart

Using makefile

Run unit test (runs npm install if needed)

```bash
cd <project>
make utest
```

Package for lamdba

```bash
make lambda
```

Using npm

```bash
npm install
npm run build
npm run test
npm run lambda
```

## Two types

Types: TOKEN and REQUEST

See (aws docs)[https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-input.html]

1. TOKEN
   You specify name of header (e.g. Authorization) and that is passed in as token. Authorizor gets 'event.token' with value of header. Simpler.

1. REQUEST

   You get all request headers, resource, etc. This is what we need for Xealth authentication.

## Other notes

We can authorize (make relatively expensive remote call) then have API GW cache the response (up to an hour). For TOKEN, cache key is just token itself. For REQUEST more complex caching logic. Another issue with caching is that the cache is per authorizer, not per function. If multiple functions use the same authorizor you need some custom logic.

For example:

- POST /pets => results in cached response
- GET /pets => uses cached response
- Howeever: Invokation ARN changes. Policy in authorizer needs to handle.

Other caveats:

- Additional cold start penalty (once for authorizer, once for core function)
- Additional processing. Every call to the endpoint must have auth headers (doesn't support unauthenticated access)
