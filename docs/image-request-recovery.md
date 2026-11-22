# Did the image provider get the request?

A timeout leaves a video producer with an awkward choice. Submitting the same shot again might buy a second image. Waiting might mean waiting for a job that never started.

From the social-flow project · Maintained by Zeans at [Ttalkkak Lab](https://github.com/ttalkkaklab)

## One missing frame, two possible bills

Imagine a storyboard with one image left to generate. The provider accepts the request, but the connection closes before the response reaches the editor. From the editor's side this looks much like a request that never reached the provider. An empty output directory fits both stories.

In social-flow's managed image path, the editor saves a plan and a request ID. Before calling the adapter, the server writes a receipt and reserves capacity. If the adapter loses the response, the server can still say which request it tried. An ambiguous error leaves that request in `submission_unknown`.

## Count the calls yourself

With Git and Node.js 20 or newer, run the two regression cases below. The fake adapter either writes a one-pixel PNG or throws a timeout. The tests use a temporary episode directory and require no provider credentials.

```sh
git clone https://github.com/ttalkkaklab/social-flow.git
cd social-flow/server && npm ci
node --import ./test/isolate.mjs --test --test-name-pattern='managed success|ambiguous failure' test/image-routing.test.mjs
```

In the success case, calling the same plan twice returns the saved result. The dispatch counter stays at one. If the saved file changes, the hash check catches it. In the timeout case, a second call with the same request ID stops before dispatch. With the fixture's single slot occupied, giving the request a new name also stops before dispatch.

## What it costs to wait

An unresolved request can hold up another shot. Reading `image_status` returns the recorded state. A supported adapter can refresh provider status. To close out an uncertain request manually, the operator records evidence and the amount spent. In the test, the local child exited without output and the spend is zero. A real provider needs its own evidence.

The same distinction matters when a job succeeds. A decoded image with the expected hash can still show the wrong character. The generation receipt marks it `not_reviewed`. Someone still has to inspect the picture.

[Read the routing code](../server/src/image-routing.ts) · [Read the assertions](../server/test/image-routing.test.mjs)

## Work on this with us

If you've integrated an image provider, what evidence does its API give you after a lost response? A link to the provider's status endpoint and a redacted example response would help us evaluate another recovery path. You can also pick a small change with a local check already described.

[Discuss an adapter](https://github.com/ttalkkaklab/social-flow/issues) · [Choose a first issue](https://github.com/ttalkkaklab/social-flow/contribute) · [Watch a finished episode](https://www.youtube.com/shorts/cO9SNY7vQRs)
