import AppKit
import Foundation
import PDFKit
import Vision

// Local-only OCR, one page at a time to bound memory.
func recognizePDF(path: String, maxPages: Int) throws {
    guard let document = PDFDocument(url: URL(fileURLWithPath: path)),
          document.pageCount <= maxPages else {
        throw NSError(domain: "BusanOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "PDF를 열 수 없거나 페이지 제한을 초과했습니다."])
    }
    for index in 0..<document.pageCount {
        try autoreleasepool {
            guard let page = document.page(at: index) else { return }
            let image = page.thumbnail(of: NSSize(width: 1800, height: 2400), for: .mediaBox)
            var rect = CGRect(origin: .zero, size: image.size)
            guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
                throw NSError(domain: "BusanOCR", code: 2)
            }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["ko-KR", "en-US"]
            request.usesLanguageCorrection = true
            try VNImageRequestHandler(cgImage: cgImage).perform([request])
            print((request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n"))
        }
    }
}

do {
    guard CommandLine.arguments.count == 3, let limit = Int(CommandLine.arguments[2]) else {
        throw NSError(domain: "BusanOCR", code: 3)
    }
    try recognizePDF(path: CommandLine.arguments[1], maxPages: limit)
} catch {
    FileHandle.standardError.write(Data(error.localizedDescription.utf8))
    exit(1)
}
