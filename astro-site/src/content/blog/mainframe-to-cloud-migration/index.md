---
title: "Fallstricke bei der Migration vom Host (Mainframe) in die Cloud und wie man sie vermeidet"
description: "Der Artikel beschreibt Ansätze, wie kritische Workloads vom Mainframe in die Cloud überführt werden können."
date: 2026-09-07
draft: true
---

### Überblick

Bei vielen Banken ist die Entscheidung, den Host abzulösen, bereits gefallen. Hauptgründe sind hohe Fixkosten und der Weggang von Entwicklern mit entsprechendem Know-how. Der Artikel zeigt, was im Detail zu beachten ist, wenn Anwendungen vom Host in die Cloud migriert werden sollen. Eine der wichtigsten Fragen dabei ist, wie man doppelte Verarbeitungen zuverlässig in einem verteilten System verhindert. Außerdem wird darauf eingegangen, dass eine 1:1-Umsetzung von Batch-Jobs nicht die beste Wahl ist, wenn diese eigentlich Events verarbeiten. 

### Ausgangslage

Bei den Legacy-Anwendungen auf dem Host gibt es in der Regel sowohl Batch-Jobs, die zeitgesteuert ausgeführt werden, und IMS- und CICS-Transaktionen, bei denen ein Event von außen die Verarbeitung anstößt. Diese können in Assembler, C, COBOL oder Java implementiert sein. Ob die Verarbeitung aktuell im Batch oder in Transaktionen erfolgt, hat naturgemäß einen großen Einfluss auf die Zielarchitektur. Die eingesetzten Programmiersprachen unterscheiden sich jedoch hauptsächlich darin, wie gut sich der vorhandene Programmcode noch analysieren lässt.

Im Falle vom Assembler ist neben der Analyse des Codes fast immer eine fachliche Rekonstruktion notwendig, weil sonst leicht Details unter den Tisch fallen. Bei Cobol ist die Codeanalyse schon leichter, d. h. hier kann man die Anforderungen an neue Services etwas direkter aus den bestehenden Programmen ableiten. Sind Jobs und Transaktionen bereits in Java implementiert, ist es natürlich sehr viel einfacher, die Businesslogik in einen Spring-Boot-Service zu übernehmen.

### Umsetzung von Batch-Jobs in der Cloud

Bei Transaktionen ist es relativ eindeutig, dass sie in der Cloud-Welt ebenfalls als eventgesteuerte Services implementiert werden sollten. Und bei Batch-Jobs liegt der Gedanke nah, dass man diese in ein Batch-Framework wie *Spring Batch* überführt. In der Praxis findet man aber viele Beispiele, in denen Batch-Jobs auch für die Verarbeitung von eingehenden Nachrichten verwendet wurden. Hier lohnt es sich auf jeden Fall, im ersten Schritt zu schauen, ob es sich um eine echte Batch-Verarbeitung oder in Wirklichkeit um eine versteckte eventgesteuerte Verarbeitung handelt.

In einem Beispiel aus der Praxis wurden Batch-Jobs für die Erstellung und Verarbeitung von Kontoauszügen verwendet. Hier gab es sowohl für die Erstellung von Kontoauszügen (camt.053 an Bankrechner) aus den Tagesumsätzen als auch für den Eingang von Kontoauszügen von anderen Banken (Empfang von camt.053 über SWIFT) zeitgesteuerte Jobs. Während es im ersten Fall vollkommen in Ordnung ist, die Jobs jeden Abend laufen zu lassen, soll beim Eingang von Kontoauszügen die Verarbeitung und ggf. Weiterleitung möglichst zeitnah erfolgen. Bei der Auszugserstellung würde man also mit einem zeitgesteuerten Service starten, wobei die weitere Verarbeitung dann auch asynchron durch weitere Services erfolgen kann. Wie das technisch funktioniert, ist weiter unten erklärt. Für den Eingang von Kontoauszügen hingegen ist es besser, direkt einen eventgesteuerten Service zu implementieren, der direkt bei Eingang eines Auszugs mit der Verarbeitung startet.

### Wann kommen Batch-Frameworks dennoch infrage?

| Kriterium          | Batch                                                                                   | Event-basiert                                                                           |
|--------------------|-----------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| Zeitpunkt / Latenz | Berichte, Tagesabschlüsse, die zu einem bestimmten Zeitpunkt vorliegen müssen           | Ergebnis muss ohne Verzögerung vorliegen                                                |
| Datenvolumen       | Massenverarbeitung                                                                      | Verarbeitung einzelner Nachrichten                                                      |
| Fehlertoleranz     | Fehler treten selten auf bzw. es ist ein sauberer Rerun notwendig                       | Eine fehlerhafte Nachricht darf die Verarbeitung anderer Nachrichten nicht beeinflussen |
| abhängige Systeme  | Aufrufer arbeiten ebenfalls batch-basiert                                               | Aufrufer erwartet zeitnah eine Antwort                                                  |
| Konsistenz         | Daten müssen zu einem bestimmten Zeitpunkt (*Cut-off*) in einem bestimmten Zustand sein | Konsistenz muss für jede einzelne Transaktion gewährleistet sein                        |

Aus der Tabelle kann man ablesen, dass sowohl die Art der Daten und Verarbeitung, die Abhängigkeit zu anderen Systemen, die Fehlertoleranz, das Volumen und die Anforderung an die Konsistenz der Daten zu betrachten sind. Ein klassischer Fall, in dem man auch in der Cloud noch Batch-Jobs einsetzen würde, ist die Erstellung von Berichten, für die umfangreiche Berechnung und Datenanalysen notwendig sind. Eingehende Nachrichten wie Zahlungen oder Kontoauszüge sollten jedoch immer eventgetrieben implementiert werden.

Wenn nur einzelne Funktionen zeitgesteuert ausgeführt werden müssen, ist ein Batch-Framework zu viel Overhead. Hier könnte man entweder mit einfachen Timern arbeiten oder, wenn sowieso eine Prozess-Engine wie *Camunda* zum Einsatz kommt, Workflows mit zeitgesteuerten Triggern dafür verwenden.

### Wie verhindert man Doppelverarbeitung bei gleichzeitiger Fehlertoleranz?

