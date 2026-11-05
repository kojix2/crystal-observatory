# Branches merge into Int32 | String; is_a? narrows the type within a branch.
value = if ARGC_UNSAFE > 1
          42
        else
          "crystal"
        end

if value.is_a?(Int32)
  value + 1
else
  value.size
end
