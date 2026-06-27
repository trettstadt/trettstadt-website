plugins {
    java
    application
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("com.pulumi:pulumi:1.10.0")
    implementation("com.pulumi:hcloud:1.24.0")
}

application {
    mainClass.set("com.trettstadt.App")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(26))
    }
}
