$p = $args[0]
$lines = Get-Content -LiteralPath $p
$from = [int]$args[1]
$to = [int]$args[2]
for ($i = $from; $i -le $to; $i++) {
  Write-Output ("{0} | {1}" -f $i, $lines[$i-1])
}
