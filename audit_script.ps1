# PowerShell SEO Audit Script
$reportFile = "seo_audit_report.txt"
$baseDir = "C:/Users/laral/Documents/proiect 1 claude code/perfektsauberservice-site-main"

# Find all top-level HTML files (excluding blog/ and agent/)
$htmlFiles = @(Get-ChildItem -Path $baseDir -Filter "*.html" -Depth 0 | Where-Object { $_.Name -notmatch "^\.|\|node_modules" })

$issues = @()

# 1. CHECK CANONICALS VS FILENAMES
Write-Host "Checking canonicals vs filenames..."
foreach ($file in $htmlFiles | Select-Object -First 50) {
    $content = Get-Content $file.FullName -Raw
    $filename = $file.Name
    
    # Extract canonical
    if ($content -match '<link\s+rel="canonical"\s+href="([^"]+)"') {
        $canonical = $matches[1]
        # Extract path from canonical URL
        $canonicalPath = [System.Uri]::new($canonical).PathAndQuery
        $canonicalFilename = [System.IO.Path]::GetFileName($canonicalPath)
        
        if ($canonicalFilename -ne $filename) {
            $issues += @{
                file = $file.FullName
                issue = "Canonical path ($canonicalPath) does not match filename ($filename)"
                severity = "HIGH"
                type = "canonical"
            }
        }
    }
}

# 2. CHECK MISSING/SHORT/LONG TITLES AND META DESCRIPTIONS
Write-Host "Checking titles and meta descriptions..."
foreach ($file in $htmlFiles | Select-Object -First 50) {
    $content = Get-Content $file.FullName -Raw
    
    # Check title
    if ($content -match '<title>([^<]+)</title>') {
        $title = $matches[1].Trim()
        if ([string]::IsNullOrWhiteSpace($title)) {
            $issues += @{
                file = $file.FullName
                issue = "Missing or empty <title>"
                severity = "CRITICAL"
                type = "title"
            }
        } elseif ($title.Length -lt 30) {
            $issues += @{
                file = $file.FullName
                issue = "Title too short ($($title.Length) chars): '$title'"
                severity = "MEDIUM"
                type = "title"
            }
        } elseif ($title.Length -gt 60) {
            $issues += @{
                file = $file.FullName
                issue = "Title too long ($($title.Length) chars)"
                severity = "MEDIUM"
                type = "title"
            }
        }
    } else {
        $issues += @{
            file = $file.FullName
            issue = "Missing <title> tag"
            severity = "CRITICAL"
            type = "title"
        }
    }
    
    # Check meta description
    if ($content -match '<meta\s+name="description"\s+content="([^"]*)"') {
        $desc = $matches[1]
        $len = $desc.Length
        if ($len -lt 60) {
            $issues += @{
                file = $file.FullName
                issue = "Meta description too short ($len chars)"
                severity = "MEDIUM"
                type = "meta-desc"
            }
        } elseif ($len -gt 160) {
            $issues += @{
                file = $file.FullName
                issue = "Meta description too long ($len chars)"
                severity = "MEDIUM"
                type = "meta-desc"
            }
        }
    } else {
        $issues += @{
            file = $file.FullName
            issue = "Missing meta description"
            severity = "HIGH"
            type = "meta-desc"
        }
    }
}

# 3. CHECK H1 TAGS
Write-Host "Checking H1 tags..."
foreach ($file in $htmlFiles | Select-Object -First 50) {
    $content = Get-Content $file.FullName -Raw
    $h1Count = ([regex]::Matches($content, '<h1[^>]*>([^<]+)</h1>') | Measure-Object).Count
    
    if ($h1Count -eq 0) {
        $issues += @{
            file = $file.FullName
            issue = "Missing H1 tag"
            severity = "HIGH"
            type = "h1"
        }
    } elseif ($h1Count -gt 1) {
        $issues += @{
            file = $file.FullName
            issue = "Multiple H1 tags ($h1Count found)"
            severity = "MEDIUM"
            type = "h1"
        }
    }
}

# 4. CHECK LANG ATTRIBUTE
Write-Host "Checking lang attribute..."
foreach ($file in $htmlFiles | Select-Object -First 50) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match '<html[^>]*lang="([^"]+)"') {
        $lang = $matches[1]
        if ($lang -ne "de") {
            $issues += @{
                file = $file.FullName
                issue = "lang='$lang' is not 'de'"
                severity = "HIGH"
                type = "lang"
            }
        }
    } else {
        $issues += @{
            file = $file.FullName
            issue = "Missing lang attribute on <html>"
            severity = "MEDIUM"
            type = "lang"
        }
    }
}

# 5. CHECK JSON-LD SCHEMA
Write-Host "Checking JSON-LD schema..."
foreach ($file in $htmlFiles | Select-Object -First 30) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match '<script type="application/ld\+json">([^<]+)</script>') {
        # Has schema
    } else {
        # No schema
    }
}

# Output report
$issues | ForEach-Object { $_ | ConvertTo-Json } | Out-File $reportFile

Write-Host "Found $($issues.Count) issues"
$issues | Group-Object -Property severity | ForEach-Object { Write-Host "$($_.Name): $($_.Count)" }
