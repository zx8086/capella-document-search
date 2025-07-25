#!/bin/bash

# Emoji Logging Validation Script
# This script checks for deprecated emoji usage in logging statements

echo "🔍 Validating emoji usage in logging statements..."
echo ""

# Define deprecated emojis that should be replaced
DEPRECATED_EMOJIS=(
    "🎯" "🌟" "🏭" "⚙️" "🔎" "📋" "🏁" "📝" "📨" "♻️"
)

# Define replacement suggestions
declare -A REPLACEMENTS=(
    ["🎯"]="🚀 (for initialization)"
    ["🌟"]="🚀 (for initialization)" 
    ["🏭"]="🚀 (for initialization)"
    ["⚙️"]="🔧 (for configuration)"
    ["🔎"]="🔍 (for debugging)"
    ["📋"]="📊 (for metrics/stats)"
    ["🏁"]="🛑 (for completion)"
    ["📝"]="📥/📤 (for data direction)"
    ["📨"]="📥/📤 (for data direction)"
    ["♻️"]="🔄 (for processing)"
)

# Search for deprecated emojis in source files
FOUND_ISSUES=false

for emoji in "${DEPRECATED_EMOJIS[@]}"; do
    echo "Checking for deprecated emoji: $emoji"
    
    # Search in TypeScript and JavaScript files
    FILES=$(grep -r -l "$emoji" src/ --include="*.ts" --include="*.js" --include="*.svelte" 2>/dev/null || true)
    
    if [ -n "$FILES" ]; then
        FOUND_ISSUES=true
        echo "❌ Found deprecated emoji $emoji in:"
        echo "$FILES" | sed 's/^/  /'
        echo "   Suggested replacement: ${REPLACEMENTS[$emoji]}"
        echo ""
    fi
done

# Check for proper emoji usage patterns
echo "🔍 Checking for proper logging patterns..."

# Check if error messages use ❌
ERROR_PATTERN_ISSUES=$(grep -r "log.*error\|err(" src/ --include="*.ts" --include="*.js" | grep -v "❌" | head -5)
if [ -n "$ERROR_PATTERN_ISSUES" ]; then
    echo "⚠️ Found error logs without ❌ emoji:"
    echo "$ERROR_PATTERN_ISSUES" | sed 's/^/  /'
    echo ""
fi

# Check if success messages use ✅
SUCCESS_PATTERN_ISSUES=$(grep -r "success\|completed\|established" src/ --include="*.ts" --include="*.js" | grep "log(" | grep -v "✅" | head -5)
if [ -n "$SUCCESS_PATTERN_ISSUES" ]; then
    echo "⚠️ Found success logs without ✅ emoji:"
    echo "$SUCCESS_PATTERN_ISSUES" | sed 's/^/  /'
    echo ""
fi

# Summary
if [ "$FOUND_ISSUES" = false ]; then
    echo "✅ No deprecated emojis found!"
    echo "✅ Emoji logging standards are being followed."
else
    echo "❌ Found deprecated emoji usage. Please update according to docs/logging-standards.md"
    exit 1
fi

echo ""
echo "📊 Validation complete. See docs/logging-standards.md for guidelines."