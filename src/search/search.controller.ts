import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchAutocompleteDto } from './dto/search-autocomplete.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('autocomplete')
  @ApiOperation({
    summary: 'Autocomplete search for locations and properties',
    description:
      'Returns a combined list of suggestions for the given query. ' +
      'Location suggestions (from the Mapbox Geocoding API, restricted to Qatar) are always included. ' +
      'Once the query is longer than 3 characters, matching properties ' +
      '(searched by property name, description, area, address and reference code) are also included. ' +
      'Location results include `name` and `location` (latitude/longitude); ' +
      'property results include `propertyName` and `slug`.',
  })
  @ApiQuery({ name: 'q', required: true, type: String, example: 'lusail' })
  @ApiResponse({
    status: 200,
    description: 'Combined autocomplete suggestions returned',
  })
  autocomplete(@Query() dto: SearchAutocompleteDto) {
    return this.searchService.autocomplete(dto);
  }
}
