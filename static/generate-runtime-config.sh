# static/generate-runtime-config.sh

#!/bin/sh
CONFIG_FILE="/app/build/client/runtime-config.js"
echo "window.ENV = {" > $CONFIG_FILE
for VAR in PUBLIC_OPENREPLAY_PROJECT_KEY PUBLIC_OPENREPLAY_INGEST_POINT PUBLIC_ELASTIC_APM_SERVICE_NAME PUBLIC_ELASTIC_APM_SERVER_URL PUBLIC_ELASTIC_APM_SERVICE_VERSION PUBLIC_ELASTIC_APM_ENVIRONMENT
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
