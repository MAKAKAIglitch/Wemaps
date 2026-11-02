package org.wemaps.app.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.LinearGradient
import android.graphics.Color

/**
 * Original Wemaps map-position arrow, pointing north before the live course rotation is applied.
 */
object LocationArrowBitmap {
    fun create(): Bitmap {
        val size = 128
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val center = size / 2f

        val haloPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(54, 42, 164, 255)
        }
        canvas.drawCircle(center, 55f, haloPaint)

        val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(105, 0, 0, 0)
            setShadowLayer(8f, 0f, 4f, Color.argb(150, 0, 0, 0))
        }

        val arrow = Path().apply {
            moveTo(64f, 8f)
            cubicTo(59f, 8f, 56f, 13f, 54f, 19f)
            lineTo(22f, 105f)
            cubicTo(19f, 113f, 26f, 119f, 33f, 115f)
            lineTo(64f, 96f)
            lineTo(95f, 115f)
            cubicTo(102f, 119f, 109f, 113f, 106f, 105f)
            lineTo(74f, 19f)
            cubicTo(72f, 13f, 69f, 8f, 64f, 8f)
            close()
        }

        canvas.drawPath(arrow, shadowPaint)

        val outlinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.STROKE
            strokeWidth = 11f
            strokeJoin = Paint.Join.ROUND
            strokeCap = Paint.Cap.ROUND
        }
        canvas.drawPath(arrow, outlinePaint)

        val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            shader = LinearGradient(
                35f, 16f, 92f, 116f,
                Color.rgb(72, 190, 255),
                Color.rgb(20, 105, 237),
                Shader.TileMode.CLAMP
            )
        }
        canvas.drawPath(arrow, fillPaint)

        val spinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(205, 255, 255, 255)
            strokeWidth = 5f
            strokeCap = Paint.Cap.ROUND
        }
        canvas.drawLine(64f, 31f, 64f, 78f, spinePaint)

        val centerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
        }
        canvas.drawCircle(center, center + 5f, 4f, centerPaint)

        return bitmap
    }
}
