# 合流で Int32 | String、is_a? の分岐内で絞り込み。
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
