Pod::Spec.new do |s|
  s.name           = 'NooklyWindow'
  s.version        = '1.0.0'
  s.summary        = 'The window Nookly runs in on iPad'
  s.description    = 'Reads where iPadOS draws the window controls, and turns the window for checks.'
  s.license        = 'AGPL-3.0-only'
  s.author         = 'Nookly'
  s.homepage       = 'https://github.com/nookly'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
