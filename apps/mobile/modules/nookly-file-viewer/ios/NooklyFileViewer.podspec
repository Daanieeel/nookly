Pod::Spec.new do |s|
  s.name           = 'NooklyFileViewer'
  s.version        = '1.0.0'
  s.summary        = 'Shows a file inside Nookly on iPhone and iPad'
  s.description    = 'PDFs in PDFKit with pages and search, every other file the system can preview in Quick Look, and thumbnails for both.'
  s.license        = 'AGPL-3.0-only'
  s.author         = 'Nookly'
  s.homepage       = 'https://github.com/nookly'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit', 'QuickLook', 'QuickLookThumbnailing'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
