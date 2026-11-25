# First test run

The server built and skill lint passed. The default full run passed 1,380 of 1,384 tests. Two Chrome captures exceeded 90 seconds, one exited with code 2 and an FFmpeg assembly test failed while render suites were running concurrently. The objective gate therefore scored zero. The editorial write, invalid input and stale-cover cases passed.

Run the complete test glob with three workers and run the separate project build's focused tests independently. Keep the original Chrome and FFmpeg tests, timeouts and production settings.

ASTRA_LOOP_RESULT: score=0 verdict=FAIL p0=1 iter=1
