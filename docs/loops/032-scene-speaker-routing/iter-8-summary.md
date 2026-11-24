# Keep the original conditioning track through assembly

The build's speech-composition step now checks a silent A2V take against its original driver and retains that WAV. The quality gate checks current line ownership and timing against the same original, and provides the verified speech intervals for picture and subtitle assembly. Neither attaching the original recording nor selecting the existing card can authorize a different WAV.

The end-to-end fixture exercises attachment, composition, source-audio selection, quality checks, subtitle times and the FFmpeg assembly entry point. It covers a stereo driver, two spoken lines, an intervening action, a changed WAV and changed timing. The release distribution is rebuilt from the locked dependencies.
