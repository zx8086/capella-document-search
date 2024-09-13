# static/generate-runtime-config.sh

#!/bin/sh
CONFIG_FILE="/app/build/client/runtime-config.js"
echo "window.ENV = {" > $CONFIG_FILE
for VAR in VITE_OPENREPLAY_PROJECT_KEY VITE_OPENREPLAY_INGEST_POINT VITE_ELASTIC_APM_SERVICE_NAME VITE_ELASTIC_APM_SERVER_URL VITE_ELASTIC_APM_SERVICE_VERSION VITE_ELASTIC_APM_ENVIRONMENT VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS
do
    eval VALUE=\$$VAR
    if [ -z "$VALUE" ]; then
        echo "Warning: $VAR is not set" >&2
        VALUE="undefined"
    fi
    echo "  $VAR: '$VALUE'," >> $CONFIG_FILE
done
echo "};" >> $CONFIG_FILE
echo "Runtime config generated:"
cat $CONFIG_FILE
