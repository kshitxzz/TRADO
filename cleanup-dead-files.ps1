# Trado — dead file/folder cleanup
# Run this from the TRADO project root (the folder containing `frontend/` and `backend/`).
#
# Every path below was verified via grep across the whole repo (both before and after
# this session's edits) to have zero live references — nothing imports them, no route
# serves them, and no build step touches them. Safe to delete.

$ErrorActionPreference = 'Stop'

$paths = @(
    # Empty folders left over from a `mkdir` whose brace expansion didn't run
    # (created a literal folder named "{a,b,c}" instead of three folders)
    'backend\{routes,services,middleware,config}',
    'frontend\src\{styles,lib,hooks,components',           # yes, no closing brace — that's the literal name on disk; it nests two levels deep before the brace closes

    # Stale backend files
    'backend\backend_package.json',                        # old duplicate of package.json, references the deprecated @google/generative-ai package
    'backend\services\geminiService.js',                    # dead — never imported; uses that same deprecated package (not even installed)

    # Orphaned auth/layout cluster (all three only ever imported each other)
    'frontend\src\context\AuthContext.jsx',                 # duplicate of hooks/useAuth.jsx, unused by the live app
    'frontend\src\components\dashboard',                    # Sidebar.jsx + TopBar.jsx, superseded by components/layout/
    'frontend\src\pages\AuthCallback.jsx',                  # not routed anywhere in App.jsx
    'frontend\src\lib\supabase.js',                         # dead duplicate Supabase client (live app uses lib/supabaseClient.js)

    # Legacy duplicate analytics pages (real ones live in pages/analytics/*)
    'frontend\src\pages\AnalyticsAdvancedReports.jsx',
    'frontend\src\pages\AnalyticsDayView.jsx',
    'frontend\src\pages\AnalyticsPerformance.jsx',
    'frontend\src\pages\AnalyticsReports.jsx',
    'frontend\src\pages\AnalyticsStrategies.jsx',
    'frontend\src\pages\AnalyticsTradeReplay.jsx',

    # Other orphaned/unused files
    'frontend\src\pages\Leaderboard.jsx',                   # /leaderboard route redirects to /progress instead of rendering this
    'frontend\src\components\charts\RadarChart.jsx',        # unused, superseded by TradeScoreRadar.jsx
    'frontend\src\assets\react.svg',                        # unused Vite boilerplate
    'frontend\src\assets\vite.svg',                          # unused Vite boilerplate

    # Stray root lockfile with no matching package.json at that level
    'package-lock.json'
)

foreach ($p in $paths) {
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Recurse -Force
        Write-Host "Deleted: $p"
    } else {
        Write-Host "Not found (already gone?): $p" -ForegroundColor Yellow
    }
}

Write-Host "`nDone. Run 'git status' (or diff your working copy) to review before committing." -ForegroundColor Green
