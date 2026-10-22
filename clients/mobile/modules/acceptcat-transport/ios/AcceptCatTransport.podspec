Pod::Spec.new do |s|
  s.name = 'AcceptCatTransport'
  s.version = '0.1.0'
  s.summary = 'Isolated AcceptCat API transport'
  s.description = 'Cookie-free native HTTP adapter for AcceptCat sessions.'
  s.license = { :type => 'See NOTICE.md', :text => 'No standalone license is declared for this private module.' }
  s.author = 'AcceptCat contributors'
  s.homepage = 'https://github.com/luoyan96/personal-agent'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => 'https://github.com/luoyan96/personal-agent.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version = '5.9'
  s.source_files = '**/*.{h,m,mm,swift}'
end
