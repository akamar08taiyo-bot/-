#!/bin/sh
# LibreOffice で Excel・印刷の見た目を確かめるための字体を用意する。
# - Google Fonts の BIZ UD 明朝・ゴシックを ~/.fonts に入れる（無いときだけ取ってくる）
# - Windows の「BIZ UDP明朝 Medium」「BIZ UDPゴシック」を BIZ UDPMincho・BIZ UDPGothic で代わりに出す（字の幅がほぼ同じなので、折り返し・はみ出しを確かめられる）
# - 住宅改修の「ＭＳ Ｐゴシック」は代わりの字体が無いと英字用の字体になるので、IPA Pゴシック（無ければ Noto Sans CJK JP）で出す
# 設定は ~/.config/fontconfig/conf.d/60-taiyo-fonts.conf に別のファイルで置く（ほかの fonts.conf は書きかえない）
# usage: sh setup-fonts.sh
mkdir -p "$HOME/.fonts" "$HOME/.config/fontconfig/conf.d" && cd "$HOME/.fonts" || exit 1
for f in bizudpmincho/BIZUDPMincho-Regular.ttf bizudpmincho/BIZUDPMincho-Bold.ttf bizudmincho/BIZUDMincho-Regular.ttf \
  bizudpgothic/BIZUDPGothic-Regular.ttf bizudpgothic/BIZUDPGothic-Bold.ttf; do
  [ -f "$(basename $f)" ] || timeout 60 curl -sS -fL -o "$(basename $f)" "https://raw.githubusercontent.com/google/fonts/main/ofl/$f" || echo "取れなかった: $f"
done
alias_xml() { # $1＝Windows の字体の名前、$2…＝代わりの字体（先にあるものから使う）
  name=$1; shift
  printf '  <match target="pattern">\n    <test qual="any" name="family"><string>%s</string></test>\n    <edit name="family" mode="prepend" binding="strong">' "$name"
  for f in "$@"; do printf '<string>%s</string>' "$f"; done
  printf '</edit>\n  </match>\n'
}
{
  printf '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n'
  printf '  <!-- 業務アプリの Excel を LibreOffice で確かめるときの代わりの字体（taiyo-excel-export スキル） -->\n'
  alias_xml 'BIZ UDP明朝 Medium' 'BIZ UDPMincho'
  alias_xml 'BIZ UDPMincho Medium' 'BIZ UDPMincho'
  alias_xml 'BIZ UDPゴシック' 'BIZ UDPGothic'
  alias_xml 'ＭＳ Ｐゴシック' 'IPAPGothic' 'Noto Sans CJK JP'
  alias_xml 'MS PGothic' 'IPAPGothic' 'Noto Sans CJK JP'
  printf '</fontconfig>\n'
} > "$HOME/.config/fontconfig/conf.d/60-taiyo-fonts.conf"
fc-cache -f > /dev/null 2>&1
for n in 'BIZ UDP明朝 Medium' 'BIZ UDPゴシック' 'ＭＳ Ｐゴシック'; do printf '%s → %s\n' "$n" "$(fc-match "$n")"; done
