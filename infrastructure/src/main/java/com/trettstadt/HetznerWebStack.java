package com.trettstadt;

import com.pulumi.core.Output;
import com.pulumi.hcloud.Firewall;
import com.pulumi.hcloud.FirewallArgs;
import com.pulumi.hcloud.inputs.FirewallRuleArgs;
import com.pulumi.hcloud.Server;
import com.pulumi.hcloud.ServerArgs;
import com.pulumi.hcloud.SshKey;
import com.pulumi.hcloud.SshKeyArgs;

import java.util.List;

public class HetznerWebStack {

    private final Output<String> serverIp;
    private final Output<String> serverId;
    private final Output<String> serverName;
    private final Output<String> sshKeyName;

    public HetznerWebStack(String stackName, String sshPublicKey) {

        var sshKey = new SshKey("web-server-ssh-key",
            SshKeyArgs.builder()
                .name("prod-web-key")
                .publicKey(sshPublicKey)
                .build()
        );

        var firewall = new Firewall("prod-web-firewall",
            FirewallArgs.builder()
                .name("prod-web-firewall")
                .rules(
                    FirewallRuleArgs.builder()
                        .description("SSH from trusted networks")
                        .direction("in")
                        .protocol("tcp")
                        .sourceIps("0.0.0.0/0", "::/0")
                        .port("22")
                        .build(),
                    FirewallRuleArgs.builder()
                        .description("HTTP")
                        .direction("in")
                        .protocol("tcp")
                        .sourceIps("0.0.0.0/0", "::/0")
                        .port("80")
                        .build(),
                    FirewallRuleArgs.builder()
                        .description("HTTPS")
                        .direction("in")
                        .protocol("tcp")
                        .sourceIps("0.0.0.0/0", "::/0")
                        .port("443")
                        .build()
                )
                .build()
        );

        var server = new Server("prod-web-server",
            ServerArgs.builder()
                .name("prod-portfolio-web")
                .serverType("cx23")
                .image("debian-13")
                .location("nbg1")
                .sshKeys(sshKey.name().applyValue(List::of))
                .firewallIds(firewall.id().applyValue(id -> List.of(Integer.parseInt(id))))
                .build()
        );

        this.serverIp = server.ipv4Address();
        this.serverId = server.id();
        this.serverName = server.name();
        this.sshKeyName = sshKey.name();
    }

    public Output<String> serverIp() {
        return serverIp;
    }

    public Output<String> serverId() {
        return serverId;
    }

    public Output<String> serverName() {
        return serverName;
    }

    public Output<String> sshKeyName() {
        return sshKeyName;
    }
}
