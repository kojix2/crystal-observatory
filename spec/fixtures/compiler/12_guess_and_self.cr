class Guessed
  def initialize
    @value = 1
  end

  def initialize(text : String)
    @value = nil
    kind = self.class
    ignored = self.probe
    @value = 2.5
  end

  def probe
    self
  end

  def value
    @value
  end
end

puts Guessed.new.value
puts Guessed.new("second").value
