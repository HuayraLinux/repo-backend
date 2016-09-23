repo-backend
============

Para obtener los datos de reprepro todo se ejecuta desde $REPREPRO_BASE_DIR

= Listado de distros:

$REPREPRO_BASE_DIR/conf/distributions

Se puede parsear el archivo con algo tipo ConfigParser de python, para tenes toda la info de cada distro
o solo tener los nombre con:

cmd:
grep Codename $REPREPRO_BASE_DIR/conf/distributions

output:
Codename: brisa
Codename: brisa-updates
Codename: brisa-proposed
Codename: pampero-proposed
Codename: pampero
Codename: pampero-updates
Codename: torbellino
Codename: 1.1
Codename: 2.0
Codename: 2.1
Codename: 2.2
Codename: 3.0
Codename: mate-brisa
Codename: mate-pampero
Codename: mate-torbellino
Codename: sud
Codename: sud-updates
Codename: sud-proposed
Codename: zonda
Codename: zonda-updates
Codename: experimental
Codename: 3.1
Codename: 3.2

= Listado de paquets por distro

reprepro list <nombre-distro>

cmd:
reprepro list torbellino 

output:
torbellino|main|i386: touchegg 1.1.1-2
torbellino|main|i386: touchegg-gui 1.1.1-2
torbellino|main|i386: turtleart 170-1huayra1
torbellino|main|i386: unetbootin 608-1
torbellino|main|i386: unetbootin-translations 608-1
torbellino|main|i386: visita 0.5.25
torbellino|main|i386: wari 2.2-7
torbellino|main|i386: xul-ext-downloadhelper 4.9.9-2
torbellino|main|i386: xul-ext-spellchecker-es-ar 2.5-1
torbellino|main|i386: zamba 2.2-7
u|torbellino|main|i386: huayra-archive-keyring-udeb 1.7
torbellino|main|amd64: albatross-gtk-theme 1.9.4-0huayra1
torbellino|main|amd64: anagramarama-data 0.4-9
torbellino|main|amd64: apicaro 1:1.0-2
torbellino|main|amd64: artomico 0.1.0-5
torbellino|main|amd64: ayni 0.3-huayra1
torbellino|main|amd64: babiloo-dicts-spanish 1.0-2
torbellino|main|amd64: base-files 8.5~huayra2
torbellino|main|amd64: bluebird-gtk-theme 1.9.4-0huayra1

= Datos de un paque en tods las distros

reprepro ls <nombre-paquete>

cmd:
reprepro ls huayra-desktop

output:
huayra-desktop | 2.74 |            brisa | source
huayra-desktop | 2.96.2 |    brisa-updates | source
huayra-desktop | 2.96.2 |   brisa-proposed | source
huayra-desktop | 2.161.4 | pampero-proposed | source
huayra-desktop | 2.146 |          pampero | source
huayra-desktop | 2.161.4 |  pampero-updates | source
huayra-desktop | 4.0.8 |       torbellino | source
huayra-desktop | 2.96 |              1.1 | source
huayra-desktop | 2.146 |              2.0 | source
huayra-desktop | 2.161.4 |              2.1 | source
huayra-desktop | 2.161.4 |              2.2 | source
huayra-desktop | 3.2.9 |              3.0 | source
huayra-desktop | 3.2.9 |              sud | source
huayra-desktop | 3.2.37 |      sud-updates | source
huayra-desktop | 3.2.37 |     sud-proposed | source
huayra-desktop | 4.0.8 |            zonda | source
huayra-desktop | 3.2.25 |              3.1 | source
huayra-desktop | 3.2.37 |              3.2 | source




