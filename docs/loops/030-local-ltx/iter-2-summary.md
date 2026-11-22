# Local Desktop and the browser test environment

The second full run passed 1,213 of 1,217 tests. Four cover tests failed in macOS Chrome. A further run with Chrome test flags passed 1,216 of 1,217. The remaining cover process reached its 90-second timeout. The independent review waited for a clean run.

All eleven cover tests subsequently passed with the installed Chromium Headless Shell. The launcher forwards arguments, standard streams and the actual browser exit code via exec. The tests still render, inspect and encode their images.

The local adapter now uses the selected device's advertised duration buckets when a shot asks for minimum coverage. An explicit unavailable duration is refused. Its managed recovery test covers a three-second shot on a device that offers two or four seconds, plus resuming the accepted job by ID.

The full suite also ran under Headless Shell with Node's default concurrency. The busy host timed out on the music and cover cases. The final check used the same npm command with two Node test workers. All 1,217 tests ran and passed, including the four cover cases and the music assembly case. No tests were skipped.
