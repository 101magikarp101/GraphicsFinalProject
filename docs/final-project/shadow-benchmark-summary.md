# Shadow Technique Benchmark Summary

Captured with `http://127.0.0.1:5175/`, 5s runs, 0s warmup, shadow strength 0.72.

| Scene | Technique | Avg CPU ms | P95 CPU ms | Avg GPU ms | P95 GPU ms | Avg FPS | Est. MB |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| open | ambient-occlusion | 1.65 | 13.00 | 2.24 | 4.24 | 112.0 | 0.0 |
| open | shadow-map | 1.60 | 13.30 | 1.97 | 2.92 | 107.8 | 16.0 |
| open | shadow-volume | 1.93 | 13.20 | 3.13 | 4.38 | 111.4 | 2.1 |
