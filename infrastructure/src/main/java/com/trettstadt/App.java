package com.trettstadt;

import com.pulumi.Pulumi;

public class App {
    public static void main(String[] args) {
        Pulumi.run(ctx -> {
            var config = ctx.config();
            var publicKey = config.require("webSshPublicKey");
            var stack = new HetznerWebStack("prod-portfolio-web", publicKey);
            ctx.export("serverIp", stack.serverIp());
            ctx.export("serverId", stack.serverId());
            ctx.export("serverName", stack.serverName());
            ctx.export("sshKeyName", stack.sshKeyName());
            ctx.export("postgresVolumeId", stack.postgresVolumeId());
            ctx.export("postgresVolumeName", stack.postgresVolumeName());
        });
    }
}
