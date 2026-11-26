package cc.zenmind.composer

import android.content.Context
import android.graphics.Color
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.inputmethod.InputMethodManager
import android.view.inputmethod.EditorInfo
import android.widget.LinearLayout
import androidx.appcompat.widget.AppCompatEditText
import androidx.core.view.ContentInfoCompat
import androidx.core.view.ViewCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class ComposerInputValue : Record {
  @Field var text: String = ""
  @Field var eventCount: Int = 0
}

class ChatComposerInputModule : Module() {
  override fun definition() = ModuleDefinition {
    // Inline registration uses the class name; view methods must export under the same name.
    Name("ChatComposerInputModule")
    View(ChatComposerInputView::class) {
      Events("onEdit", "onContentSizeChange")
      Prop("value") { view: ChatComposerInputView, value: ComposerInputValue -> view.apply(value) }
      Prop("placeholder") { view: ChatComposerInputView, value: String -> view.input.hint = value }
      Prop("placeholderTextColor") { view: ChatComposerInputView, value: String -> view.input.setHintTextColor(Color.parseColor(value)) }
      Prop("textColor") { view: ChatComposerInputView, value: String -> view.input.setTextColor(Color.parseColor(value)) }
      Prop("fontSize") { view: ChatComposerInputView, value: Float -> view.fontSize = value; view.updateTypography() }
      Prop("lineHeight") { view: ChatComposerInputView, value: Float -> view.lineHeight = value; view.updateTypography() }
      Prop("editable") { view: ChatComposerInputView, value: Boolean -> view.input.isEnabled = value }
      Prop("scrollEnabled") { view: ChatComposerInputView, value: Boolean -> view.input.isVerticalScrollBarEnabled = value }
      AsyncFunction("focus") { view: ChatComposerInputView -> view.focusInput() }
      AsyncFunction("blur") { view: ChatComposerInputView -> view.blurInput() }
    }
  }
}

class ChatComposerInputView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  // No coalescing key: every edit, including consecutive pastes, must reach JS.
  private val onEdit by EventDispatcher()
  private val onContentSizeChange by EventDispatcher()
  val input = AppCompatEditText(context)
  var fontSize = 16f
  var lineHeight = 22f
  override val shouldUseAndroidLayout = true
  private var eventCount = 0
  private var applying = false
  private var observedText = ""
  private var editStart = 0
  private var editEnd = 0
  private var editReplacement = ""
  private var lastContentHeight = -1f

  init {
    input.background = null
    input.gravity = Gravity.TOP or Gravity.START
    input.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
    input.imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_ENTER_ACTION
    input.setPadding(0, dp(8f).toInt(), 0, dp(8f).toInt())
    input.setHorizontallyScrolling(false)
    input.includeFontPadding = false
    addView(input, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    updateTypography()
    input.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) = Unit
      override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) {
        if (applying) return
        editStart = start
        editEnd = start + before
        editReplacement = text?.subSequence(start, start + count)?.toString() ?: ""
      }
      override fun afterTextChanged(text: Editable?) {
        if (!applying && text.toString() != observedText) emitEdit(editStart, editEnd, editReplacement)
      }
    })
    // SOURCE_CLIPBOARD is the platform's paste origin, unlike IME commitText.
    // Returning other content lets AppCompat keep its normal input/IME behavior.
    ViewCompat.setOnReceiveContentListener(input, arrayOf("text/*")) { _, content ->
      if (content.source != ContentInfoCompat.SOURCE_CLIPBOARD || !input.isEnabled) {
        content
      } else {
        val pasted = (0 until content.clip.itemCount).mapNotNull { content.clip.getItemAt(it).coerceToText(context)?.toString() }.joinToString("\n")
        if (shouldFold(pasted)) {
          foldPaste(pasted)
          null
        } else content
      }
    }
  }

  fun apply(value: ComposerInputValue) {
    // Never reassign an equal value: that would destroy composing spans and selection.
    if (value.eventCount != eventCount || value.text == input.text.toString()) return
    val start = input.selectionStart.coerceAtLeast(0).coerceAtMost(value.text.length)
    val end = input.selectionEnd.coerceAtLeast(0).coerceAtMost(value.text.length)
    applying = true
    input.setText(value.text)
    input.setSelection(start, end)
    observedText = value.text
    applying = false
    input.post { reportContentSize() }
  }

  fun updateTypography() {
    // JS supplies fontScale-adjusted points, so use DIP rather than applying SP twice.
    input.setTextSize(TypedValue.COMPLEX_UNIT_DIP, fontSize)
    input.setLineSpacing(dp(lineHeight) - input.paint.fontSpacing, 1f)
    input.post { reportContentSize() }
  }

  fun focusInput() {
    if (!input.isEnabled) return
    input.requestFocus()
    (context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
      .showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
  }

  fun blurInput() {
    if (!input.hasFocus()) return
    input.clearFocus()
    (context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
      .hideSoftInputFromWindow(input.windowToken, 0)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    reportContentSize()
  }

  private fun foldPaste(pasted: String) {
    val text = input.text ?: return
    val start = minOf(input.selectionStart, input.selectionEnd).coerceIn(0, text.length)
    val end = maxOf(input.selectionStart, input.selectionEnd).coerceIn(start, text.length)
    applying = true
    text.replace(start, end, "")
    input.setSelection(start)
    applying = false
    emitEdit(start, end, "", pasted)
  }

  private fun emitEdit(start: Int, end: Int, replacement: String, pastedText: String? = null) {
    eventCount += 1
    observedText = input.text.toString()
    val event = mutableMapOf<String, Any>(
      "text" to observedText, "eventCount" to eventCount,
      "selectionStart" to input.selectionStart.coerceAtLeast(0),
      "selectionEnd" to input.selectionEnd.coerceAtLeast(0),
      "start" to start, "end" to end, "replacement" to replacement
    )
    if (pastedText != null) event["pastedText"] = pastedText
    onEdit(event)
    input.post { reportContentSize() }
  }

  private fun reportContentSize() {
    val layout = input.layout ?: return
    val height = (layout.height + input.totalPaddingTop + input.totalPaddingBottom) / resources.displayMetrics.density
    if (height == lastContentHeight) return
    lastContentHeight = height
    onContentSizeChange(mapOf("height" to height))
  }

  private fun shouldFold(text: String): Boolean = text.isNotBlank() &&
    (text.length >= 2000 || text.replace("\r\n", "\n").replace('\r', '\n').count { it == '\n' } >= 19)

  private fun dp(value: Float): Float = value * resources.displayMetrics.density
}
