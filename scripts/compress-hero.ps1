Add-Type -AssemblyName System.Drawing

function Compress-ImageFile ($srcPath, $destPath, $maxWidth, $quality) {
    if (Test-Path $srcPath) {
        $img = [System.Drawing.Image]::FromFile($srcPath)
        $newW = $img.Width
        $newH = $img.Height
        if ($maxWidth -gt 0 -and $newW -gt $maxWidth) {
            $newH = [int]($img.Height * ($maxWidth / $img.Width))
            $newW = $maxWidth
        }
        $bmp = New-Object System.Drawing.Bitmap($newW, $newH)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($img, 0, 0, $newW, $newH)
        $g.Dispose()
        $img.Dispose()

        $codecs = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()
        $jpegCodec = $null
        foreach ($c in $codecs) {
            if ($c.FormatDescription -eq "JPEG") { $jpegCodec = $c; break }
        }

        $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $quality)

        $bmp.Save($destPath, $jpegCodec, $ep)
        $bmp.Dispose()

        $item = Get-Item $destPath
        Write-Host "Compressed $srcPath -> $($item.Name) ($($item.Length) bytes)"
    }
}

$pubDir = "D:\CODE\Projects\Markhor System\AI-E-commerce\apps\web\public"
Compress-ImageFile "$pubDir\hero\trade_in_user_gen.png" "$pubDir\hero\trade_in_user_gen.jpg" 1920 82
Compress-ImageFile "$pubDir\hero\image.png" "$pubDir\hero\image.jpg" 1920 80
Compress-ImageFile "$pubDir\playstore.png" "$pubDir\playstore.jpg" 500 85
Compress-ImageFile "$pubDir\iphone14pro-order.png" "$pubDir\iphone14pro-order.jpg" 800 82
