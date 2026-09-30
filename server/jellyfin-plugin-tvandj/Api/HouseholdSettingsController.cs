using System.Net.Mime;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TvAndJ.Api;

/// <summary>The household settings, as the apps send and receive them.</summary>
/// <param name="Value">The settings: any JSON object.</param>
/// <param name="UpdatedAt">When they last changed, in Unix milliseconds.</param>
public record HouseholdSettings(JsonElement Value, long UpdatedAt);

/// <summary>
/// Read (any signed-in user) and change (administrators) the household settings.
/// Changes carry the time they were made; one older than what's stored is ignored,
/// so a device that was offline can't wind the settings back.
/// </summary>
[ApiController]
[Route("TvAndJ")]
[Authorize]
[Produces(MediaTypeNames.Application.Json)]
public class HouseholdSettingsController : ControllerBase
{
    /// <summary>Keep the stored JSON small; it's a handful of settings, not a data store.</summary>
    private const int MaxSettingsLength = 16 * 1024;

    [HttpGet("Household")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<HouseholdSettings> GetHousehold()
    {
        var config = Plugin.Instance!.Configuration;
        return new HouseholdSettings(Parse(config.SettingsJson), config.UpdatedAt);
    }

    [HttpPost("Household")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<HouseholdSettings> UpdateHousehold([FromBody] HouseholdSettings settings)
    {
        if (settings.Value.ValueKind != JsonValueKind.Object)
        {
            return BadRequest("Household settings must be a JSON object.");
        }

        var json = settings.Value.GetRawText();
        if (json.Length > MaxSettingsLength)
        {
            return BadRequest("Household settings are too large.");
        }

        var plugin = Plugin.Instance!;
        var config = plugin.Configuration;
        // Newest wins: a stale copy gets the current settings back instead.
        if (settings.UpdatedAt > config.UpdatedAt)
        {
            config.SettingsJson = json;
            config.UpdatedAt = settings.UpdatedAt;
            plugin.SaveConfiguration();
        }

        return new HouseholdSettings(Parse(config.SettingsJson), config.UpdatedAt);
    }

    private static JsonElement Parse(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            using var empty = JsonDocument.Parse("{}");
            return empty.RootElement.Clone();
        }
    }
}
