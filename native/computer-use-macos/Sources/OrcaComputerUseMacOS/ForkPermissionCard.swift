import AppKit

/// fork (F006): the draggable app card in the permission window. Off unless the fork app passes
/// the argument, so an upstream launch keeps upstream's window.
enum ForkPermissionCard {
    static let argument = "--fork-drag-card"
    static let enabled = CommandLine.arguments.contains(argument)
    static let dragHint = "Drag the app card below into the permission list in System Settings, then enable its switch."

    /// The card replaces the header icon and sits under the text in every state (checking,
    /// missing, ready), so switching states never moves the window's content. It takes a drag
    /// only while a permission is missing.
    static func install(in header: NSStackView, replacing icon: NSView, subtitle: NSTextField, appURL: URL, draggable: Bool) {
        guard enabled else { return }
        header.removeArrangedSubview(icon)
        icon.removeFromSuperview()
        let card = ForkPermissionAppCard(appURL: appURL, draggable: draggable)
        card.translatesAutoresizingMaskIntoConstraints = false
        header.addArrangedSubview(card)
        card.heightAnchor.constraint(equalToConstant: 42).isActive = true
        card.widthAnchor.constraint(equalTo: header.widthAnchor).isActive = true
        if draggable {
            subtitle.stringValue = dragHint
        }
    }
}

/// Upstream's app tile, but the whole card starts a drag, even from an inactive window (System
/// Settings is in front), and only while `draggable`.
private final class ForkPermissionAppCard: DraggableAppTile {
    private let draggable: Bool

    init(appURL: URL, draggable: Bool) {
        self.draggable = draggable
        super.init(appURL: appURL)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        super.hitTest(point) == nil ? nil : self
    }

    override func mouseDragged(with event: NSEvent) {
        if draggable {
            super.mouseDragged(with: event)
        }
    }
}
