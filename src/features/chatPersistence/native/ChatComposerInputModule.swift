import ExpoModulesCore
import UIKit

private struct ComposerInputValue: Record {
  @Field var text: String = ""
  @Field var eventCount: Int = 0
}

public class ChatComposerInputModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChatComposerInput")
    View(ChatComposerInputView.self) {
      Events("onEdit", "onContentSizeChange")
      Prop("value") { (view, value: ComposerInputValue) in view.apply(value) }
      Prop("placeholder") { (view, value: String) in view.setPlaceholder(value) }
      Prop("placeholderTextColor") { (view, value: UIColor) in view.placeholder.textColor = value }
      Prop("textColor") { (view, value: UIColor) in view.input.textColor = value }
      Prop("fontSize") { (view, value: Double) in view.fontSize = CGFloat(value); view.updateTypography() }
      Prop("lineHeight") { (view, value: Double) in view.lineHeight = CGFloat(value); view.updateTypography() }
      Prop("editable") { (view, value: Bool) in view.input.isEditable = value }
      Prop("scrollEnabled") { (view, value: Bool) in view.input.isScrollEnabled = value }
      AsyncFunction("focus") { (view: ChatComposerInputView) in
        if view.input.isEditable { view.input.becomeFirstResponder() }
      }
      AsyncFunction("blur") { (view: ChatComposerInputView) in
        view.input.resignFirstResponder()
      }
    }
  }
}

private final class ChatComposerInputView: ExpoView, UITextViewDelegate, UITextPasteDelegate {
  let onEdit = EventDispatcher()
  let onContentSizeChange = EventDispatcher()
  let input = UITextView()
  let placeholder = UILabel()
  var fontSize: CGFloat = 16
  var lineHeight: CGFloat = 22
  private var eventCount = 0
  private var observedText = ""
  private var applying = false
  private var lastContentHeight: CGFloat = -1
  private var proposedEdit: (text: String, range: NSRange, replacement: String)?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    input.delegate = self
    input.pasteDelegate = self
    input.backgroundColor = .clear
    input.textContainerInset = UIEdgeInsets(top: 8, left: 0, bottom: 8, right: 0)
    input.textContainer.lineFragmentPadding = 0
    input.allowsEditingTextAttributes = false
    input.autocapitalizationType = .sentences
    input.keyboardDismissMode = .none
    input.alwaysBounceVertical = false
    placeholder.isUserInteractionEnabled = false
    placeholder.isAccessibilityElement = false
    placeholder.numberOfLines = 1
    input.addSubview(placeholder)
    addSubview(input)
    updateTypography()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    input.frame = bounds
    placeholder.frame = CGRect(x: 0, y: 8, width: bounds.width, height: lineHeight)
    reportContentSize()
  }

  func setPlaceholder(_ value: String) {
    placeholder.text = value
    input.accessibilityLabel = value
  }

  func updateTypography() {
    input.font = .systemFont(ofSize: fontSize)
    placeholder.font = input.font
    let paragraph = NSMutableParagraphStyle()
    paragraph.minimumLineHeight = lineHeight
    paragraph.maximumLineHeight = lineHeight
    input.typingAttributes[.paragraphStyle] = paragraph
    input.textStorage.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: (input.text as NSString).length))
    setNeedsLayout()
  }

  func apply(_ value: ComposerInputValue) {
    // Acknowledging the current text must not disturb selection or marked IME text.
    guard value.eventCount == eventCount, value.text != input.text else { return }
    applying = true
    let selection = input.selectedRange
    input.text = value.text
    let length = (value.text as NSString).length
    let start = min(selection.location, length)
    input.selectedRange = NSRange(location: start, length: min(selection.length, length - start))
    observedText = value.text
    proposedEdit = nil
    placeholder.isHidden = !value.text.isEmpty
    applying = false
    updateTypography()
    reportContentSize()
  }

  func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
    if !applying { proposedEdit = (observedText, range, text) }
    return true
  }

  func textViewDidChange(_ textView: UITextView) {
    guard !applying, input.text != observedText else { return }
    let text = input.text ?? ""
    if let edit = proposedEdit,
       edit.text == observedText,
       NSMaxRange(edit.range) <= (observedText as NSString).length,
       (observedText as NSString).replacingCharacters(in: edit.range, with: edit.replacement) == text {
      emitEdit(range: edit.range, replacement: edit.replacement)
    } else {
      // UIKit can update marked text without shouldChangeTextIn. This is only an exact
      // edit description; it never classifies ordinary input as a paste.
      let edit = difference(from: observedText, to: text, caret: input.selectedRange.location)
      emitEdit(range: edit.range, replacement: edit.replacement)
    }
  }

  func textPasteConfigurationSupporting(
    _ textPasteConfigurationSupporting: UITextPasteConfigurationSupporting,
    performPasteOf attributedString: NSAttributedString,
    to textRange: UITextRange
  ) -> UITextRange {
    guard input.isEditable else { return textRange }
    let start = input.offset(from: input.beginningOfDocument, to: textRange.start)
    let end = input.offset(from: input.beginningOfDocument, to: textRange.end)
    let range = NSRange(location: start, length: end - start)
    let pasted = attributedString.string
    let folded = shouldFold(pasted)
    let replacement = folded ? "" : pasted
    // UIKit supplies the final range after asynchronous paste providers complete.
    // Apply once natively, then deliver one ordered event including the full paste.
    applying = true
    input.replace(textRange, withText: replacement)
    let caret = input.position(from: input.beginningOfDocument, offset: start + (replacement as NSString).length) ?? input.endOfDocument
    let result = input.textRange(from: caret, to: caret) ?? textRange
    input.selectedTextRange = result
    applying = false
    // UIKit may already have removed a selected range before invoking the paste
    // delegate. Describe the whole visible change if that removal was not reported.
    let change: (range: NSRange, replacement: String)
    if NSMaxRange(range) <= (observedText as NSString).length,
       (observedText as NSString).replacingCharacters(in: range, with: replacement) == input.text {
      change = (range, replacement)
    } else {
      change = difference(from: observedText, to: input.text ?? "", caret: input.selectedRange.location)
    }
    emitEdit(range: change.range, replacement: change.replacement, pastedText: folded ? pasted : nil)
    return result
  }

  private func emitEdit(range: NSRange, replacement: String, pastedText: String? = nil) {
    eventCount += 1
    observedText = input.text ?? ""
    proposedEdit = nil
    placeholder.isHidden = !observedText.isEmpty
    let selection = input.selectedRange
    var event: [String: Any] = [
      "text": observedText, "eventCount": eventCount,
      "selectionStart": selection.location, "selectionEnd": NSMaxRange(selection),
      "start": range.location, "end": NSMaxRange(range), "replacement": replacement
    ]
    if let pastedText { event["pastedText"] = pastedText }
    onEdit(event)
    reportContentSize()
  }

  private func reportContentSize() {
    guard bounds.width > 0 else { return }
    let height = input.sizeThatFits(CGSize(width: bounds.width, height: .greatestFiniteMagnitude)).height
    guard abs(height - lastContentHeight) > 0.1 else { return }
    lastContentHeight = height
    onContentSizeChange(["height": height])
  }

  private func shouldFold(_ text: String) -> Bool {
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
    return (text as NSString).length >= 2000 || text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").components(separatedBy: "\n").count >= 20
  }

  private func difference(from before: String, to after: String, caret: Int) -> (range: NSRange, replacement: String) {
    let old = before as NSString, new = after as NSString
    var start = 0, oldEnd = old.length, newEnd = new.length
    // The final caret fixes the edit's right boundary when repeated text would
    // otherwise move an insertion/deletion to the other side of a text card.
    if caret >= 0 && caret <= new.length {
      let previousCaret = caret + old.length - new.length
      if previousCaret >= 0 && previousCaret <= old.length,
         old.substring(from: previousCaret) == new.substring(from: caret) {
        oldEnd = previousCaret
        newEnd = caret
      }
    }
    while start < oldEnd && start < newEnd && old.character(at: start) == new.character(at: start) { start += 1 }
    while oldEnd > start && newEnd > start && old.character(at: oldEnd - 1) == new.character(at: newEnd - 1) { oldEnd -= 1; newEnd -= 1 }
    return (NSRange(location: start, length: oldEnd - start), new.substring(with: NSRange(location: start, length: newEnd - start)))
  }
}
