Pod::Spec.new do |s|
  s.name           = 'NooklyHaptics'
  s.version        = '1.0.0'
  s.summary        = 'Core Haptics patterns for Nookly'
  s.description    = 'Plays the Taptic Engine patterns Nookly names, with the system feedback generators as a fallback.'
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
